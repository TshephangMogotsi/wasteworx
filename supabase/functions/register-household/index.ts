import { authorizeHouseholdAdministrator } from '../_shared/auth.ts';
import { errorResponse, HttpError, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';
import { sendHouseholdInvitation } from '../_shared/invitations.ts';

const requiredFields = [
  'household_name',
  'primary_contact_name',
  'primary_contact_email',
  'address_line_1',
  'suburb',
  'city',
] as const;

function cleanString(body: Record<string, unknown>, key: string, maximumLength: number) {
  const value = body[key];
  if (value !== undefined && typeof value !== 'string') {
    throw new HttpError(400, `${key} must be text.`, 'invalid_request');
  }
  const cleaned = (value ?? '').trim();
  if (cleaned.length > maximumLength) {
    throw new HttpError(400, `${key} is too long.`, 'invalid_request');
  }
  return cleaned;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.', code: 'method_not_allowed' }, 405);

  try {
    const { admin, userClient } = await authorizeHouseholdAdministrator(request);
    const body = await readJson(request);
    const fields = {
      household_name: cleanString(body, 'household_name', 160),
      primary_contact_name: cleanString(body, 'primary_contact_name', 160),
      primary_contact_email: cleanString(body, 'primary_contact_email', 320).toLowerCase(),
      primary_contact_phone: cleanString(body, 'primary_contact_phone', 40),
      property_reference: cleanString(body, 'property_reference', 120),
      address_line_1: cleanString(body, 'address_line_1', 200),
      address_line_2: cleanString(body, 'address_line_2', 200),
      suburb: cleanString(body, 'suburb', 120),
      city: cleanString(body, 'city', 120),
      district: cleanString(body, 'district', 120),
      access_notes: cleanString(body, 'access_notes', 1_000),
      operational_notes: cleanString(body, 'operational_notes', 1_000),
      verification_method: cleanString(body, 'verification_method', 40),
    };

    for (const field of requiredFields) {
      if (!fields[field]) throw new HttpError(400, `${field} is required.`, 'invalid_request');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.primary_contact_email)) {
      throw new HttpError(400, 'Enter a valid primary-contact email address.', 'invalid_email');
    }
    if (!['event_in_person', 'hoa_property_list'].includes(fields.verification_method)) {
      throw new HttpError(400, 'Select a supported address-verification method.', 'invalid_request');
    }
    if (body.consent_confirmed !== true) {
      throw new HttpError(400, 'Confirm the resident’s pilot consent before registration.', 'consent_required');
    }

    const { data: rows, error: registrationError } = await userClient.rpc('register_household', {
      ...fields,
      consent_version: 'pilot-v1',
    });
    if (registrationError) {
      const duplicate = registrationError.code === '23505';
      throw new HttpError(
        duplicate ? 409 : 400,
        registrationError.message,
        duplicate ? 'duplicate_registration' : 'registration_failed',
      );
    }

    const registration = (rows as Array<{
      created_household_id: string;
      created_address_id: string;
      created_membership_id: string;
      created_household_code: string;
    }> | null)?.[0];
    if (!registration) throw new Error('The registration transaction returned no household.');

    try {
      const invitation = await sendHouseholdInvitation(
        userClient,
        admin,
        registration.created_membership_id,
      );
      return jsonResponse(request, { ...registration, invitation }, 201);
    } catch (inviteFailure) {
      const message = inviteFailure instanceof Error ? inviteFailure.message : 'Invitation delivery failed.';
      return jsonResponse(
        request,
        {
          ...registration,
          invitation: {
            membershipId: registration.created_membership_id,
            message,
            status: 'failed',
          },
        },
        201,
      );
    }
  } catch (error) {
    return errorResponse(request, error);
  }
});
