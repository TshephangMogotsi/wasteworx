import { authorizeHouseholdAdministrator } from '../_shared/auth.ts';
import { errorResponse, HttpError, jsonResponse, optionsResponse, readJson } from '../_shared/http.ts';
import { sendHouseholdInvitation } from '../_shared/invitations.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed.', code: 'method_not_allowed' }, 405);

  try {
    const { admin, userClient } = await authorizeHouseholdAdministrator(request);
    const body = await readJson(request);
    const membershipId = typeof body.membership_id === 'string' ? body.membership_id.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(membershipId)) {
      throw new HttpError(400, 'A valid membership_id is required.', 'invalid_membership_id');
    }

    const invitation = await sendHouseholdInvitation(userClient, admin, membershipId);
    return jsonResponse(request, { invitation });
  } catch (error) {
    return errorResponse(request, error);
  }
});
