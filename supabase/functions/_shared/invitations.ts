import type { SupabaseClient } from 'supabase';

import { HttpError } from './http.ts';

type InvitationReservation = {
  invitation_attempt_id: string;
  membership_id: string;
  household_id: string;
  household_code: string;
  resident_email: string;
  resident_name: string;
  existing_auth_user_id: string | null;
};

export type InvitationDelivery = {
  membershipId: string;
  sentAt: string;
  status: 'sent';
};

function databaseFailure(error: { code?: string; message: string }) {
  if (error.message.includes('wait 60 seconds') || error.message.includes('daily invitation limit')) {
    return new HttpError(429, error.message, 'invite_rate_limited');
  }
  if (error.code === '42501') return new HttpError(403, error.message, 'forbidden');
  if (error.code === 'P0002') return new HttpError(404, error.message, 'membership_not_found');
  if (error.code === '22023') return new HttpError(409, error.message, 'membership_not_invitable');
  return new Error(error.message);
}

export async function sendHouseholdInvitation(
  userClient: SupabaseClient,
  admin: SupabaseClient,
  membershipId: string,
): Promise<InvitationDelivery> {
  const { data: reservationRows, error: reservationError } = await userClient.rpc(
    'reserve_household_invitation',
    { target_membership_id: membershipId },
  );
  if (reservationError) throw databaseFailure(reservationError);

  const reservation = (reservationRows as InvitationReservation[] | null)?.[0];
  if (!reservation) throw new Error('The invitation reservation was not returned.');

  const redirectTo = Deno.env.get('INVITE_REDIRECT_URL') ?? 'wasteworx://update-password';
  const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(
    reservation.resident_email,
    {
      data: {
        full_name: reservation.resident_name,
        household_id: reservation.household_id,
        membership_id: reservation.membership_id,
      },
      redirectTo,
    },
  );

  if (invitationError || !invitation.user) {
    await userClient.rpc('fail_household_invitation', {
      target_invitation_attempt_id: reservation.invitation_attempt_id,
      target_error_code: `auth_${invitationError?.status ?? 'unknown'}`,
    });
    throw new HttpError(
      invitationError?.status === 429 ? 429 : 502,
      invitationError?.message ?? 'Supabase Auth did not create the invitation.',
      'invite_delivery_failed',
    );
  }

  const { data: sentAt, error: completionError } = await userClient.rpc(
    'complete_household_invitation',
    {
      target_invitation_attempt_id: reservation.invitation_attempt_id,
      target_auth_user_id: invitation.user.id,
    },
  );

  if (completionError) {
    await userClient.rpc('fail_household_invitation', {
      target_invitation_attempt_id: reservation.invitation_attempt_id,
      target_error_code: 'membership_completion_failed',
    });
    throw new Error(`Invitation sent but membership linking failed: ${completionError.message}`);
  }

  return {
    membershipId: reservation.membership_id,
    sentAt: sentAt as string,
    status: 'sent',
  };
}
