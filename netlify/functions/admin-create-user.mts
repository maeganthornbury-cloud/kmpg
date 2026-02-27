import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const { identity, user } = context.clientContext || {}

  if (!identity || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized. You must be logged in.' }) }
  }

  const callerRoles: string[] = user.app_metadata?.roles || []
  if (!callerRoles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden. Only admins can create users.' }) }
  }

  const { email, fullName, roles } = JSON.parse(event.body || '{}')

  if (!email || !Array.isArray(roles) || roles.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Request body must include "email" and at least one role.' }),
    }
  }

  const validRoles = ['admin', 'office', 'shop', 'field']
  const normalizedRoles = roles.map((r: string) => String(r).toLowerCase())
  const invalidRoles = normalizedRoles.filter((r: string) => !validRoles.includes(r))
  if (invalidRoles.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Invalid roles: ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}` }),
    }
  }

  const adminAuthHeader = `Bearer ${identity.token}`
  const createResponse = await fetch(`${identity.url}/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: adminAuthHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      app_metadata: { roles: normalizedRoles },
      user_metadata: fullName ? { full_name: fullName } : {},
      email_verified: false,
      invite: true,
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    return {
      statusCode: createResponse.status,
      body: JSON.stringify({ error: `Failed to create user: ${errorText}` }),
    }
  }

  const createdUser = await createResponse.json()
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `User created and invited: ${email}`,
      user: createdUser,
    }),
  }
}

export { handler }
