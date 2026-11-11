import { authorizeHouseholdAdministrator } from '../_shared/auth.ts';
import { errorResponse, HttpError, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  try {
    const { admin, userClient } = await authorizeHouseholdAdministrator(request);
    const body = await readJson(request);
    if (typeof body.business_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.business_id)) {
      throw new HttpError(400, 'Select a valid business.', 'invalid_request');
    }
    const { data, error } = await userClient.rpc('reserve_business_invitation', { target_business: body.business_id });
    if (error) throw new HttpError(error.message.includes('rate limit') ? 429 : 409, error.message, 'invitation_unavailable');
    const reservation = data as { attempt_id: string; email: string; full_name: string; existing_user_id: string | null };
    let userId = reservation.existing_user_id;
    // An existing confirmed account can sign in normally; never reset its password.
    if (!userId) {
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(reservation.email, {
        data: { full_name: reservation.full_name },
        redirectTo: Deno.env.get('INVITE_REDIRECT_URL') ?? 'wasteworx://update-password',
      });
      if (inviteError || !invitation.user) {
        const { error: failureError } = await admin.rpc('finish_business_invitation', {
          attempt_id: reservation.attempt_id, auth_user_id: null, failure_code: `auth_${inviteError?.status ?? 'unknown'}`,
        });
        if (failureError) throw new Error('Invitation failed and its delivery status could not be recorded. Please reload before retrying.');
        throw new HttpError(502, inviteError?.message ?? 'Invitation delivery failed.', 'invite_delivery_failed');
      }
      userId = invitation.user.id;
    }
    const { error: completionError } = await admin.rpc('finish_business_invitation', {
      attempt_id: reservation.attempt_id, auth_user_id: userId,
    });
    if (completionError) throw new Error('The account was found or invited, but membership linking failed. Reload and retry after 60 seconds.');
    return jsonResponse(request, { status: reservation.existing_user_id ? 'linked' : 'sent' });
  } catch (error) {
    return errorResponse(request, error);
  }
});
