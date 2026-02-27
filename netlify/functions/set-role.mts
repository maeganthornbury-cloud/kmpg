import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const { identity, user } = context.clientContext || {}

  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized. You must be logged in.' }) }
  }

  const callerRoles: string[] = user.app_metadata?.roles || []
  if (!callerRoles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden. Only admins can set roles.' }) }
  }

  const { userId, userEmail, roles } = JSON.parse(event.body || '{}')

  if ((!userId && !userEmail) || !Array.isArray(roles)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Request body must include either "userId" or "userEmail", plus "roles" (array of strings).' }),
    }
  }

  const validRoles = ['admin', 'office', 'shop', 'field']
  const invalidRoles = roles.filter((r: string) => !validRoles.includes(r))
  if (invalidRoles.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Invalid roles: ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}` }),
    }
  }

  const adminAuthHeader = `Bearer ${identity.token}`
  let targetUserId = userId
  if (!targetUserId && userEmail) {
    const listResponse = await fetch(`${identity.url}/admin/users`, {
      method: 'GET',
      headers: { Authorization: adminAuthHeader },
    })
    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      return {
        statusCode: listResponse.status,
        body: JSON.stringify({ error: `Failed to search users: ${errorText}` }),
      }
    }
    const users = await listResponse.json()
    const foundUser = (users || []).find((u: any) => String(u.email || '').toLowerCase() === String(userEmail).toLowerCase())
    if (!foundUser?.id) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: `No user found with email ${userEmail}` }),
      }
    }
    targetUserId = foundUser.id
  }

  const response = await fetch(`${identity.url}/admin/users/${targetUserId}`, {
    method: 'PUT',
    headers: { Authorization: adminAuthHeader },
    body: JSON.stringify({ app_metadata: { roles } }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: `Failed to update user roles: ${errorText}` }),
    }
  }

  const updatedUser = await response.json()
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Roles updated successfully for user ${targetUserId}`,
      targetUserId,
      roles,
      user: updatedUser,
    }),
  }
}

export { handler }
