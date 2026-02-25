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

  const { userId, roles } = JSON.parse(event.body || '{}')

  if (!userId || !Array.isArray(roles)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Request body must include "userId" (string) and "roles" (array of strings).' }),
    }
  }

  const validRoles = ['admin', 'editor', 'viewer']
  const invalidRoles = roles.filter((r: string) => !validRoles.includes(r))
  if (invalidRoles.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Invalid roles: ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}` }),
    }
  }

  const adminAuthHeader = `Bearer ${identity.token}`
  const response = await fetch(`${identity.url}/admin/users/${userId}`, {
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
      message: `Roles updated successfully for user ${userId}`,
      roles,
      user: updatedUser,
    }),
  }
}

export { handler }
