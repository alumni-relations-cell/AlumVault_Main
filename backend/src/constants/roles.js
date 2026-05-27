/**
 * Role hierarchy and permissions for the Alumni Portal.
 * Roles: super_admin > admin > team_lead > team_member
 */

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  TEAM_LEAD: 'team_lead',
  TEAM_MEMBER: 'team_member',
};

const ROLE_PERMISSIONS = {
  super_admin: [
    'alumni:read', 'alumni:write', 'alumni:delete', 'alumni:export', 'alumni:reveal_request', 'alumni:reveal_approve',
    'import:create', 'import:cancel', 'import:read', 'import:rollback',
    'review:read', 'review:resolve',
    'campaign:create', 'campaign:read', 'campaign:update',
    'user:create', 'user:read', 'user:update', 'user:delete',
    'sessions:manage', 'settings:manage', 'export:create',
    'audit:read', 'enrichment:trigger', 'dashboard:read'
  ],
  admin: [
    'alumni:read', 'alumni:write', 'alumni:delete', 'alumni:export', 'alumni:reveal_request', 'alumni:reveal_approve',
    'import:create', 'import:cancel', 'import:read', 'import:rollback',
    'review:read', 'review:resolve',
    'campaign:create', 'campaign:read', 'campaign:update',
    'user:create', 'user:read', 'user:update',
    'audit:read', 'enrichment:trigger', 'dashboard:read'
  ],
  team_lead: [
    'alumni:read', 'alumni:write', 'alumni:export', 'alumni:reveal_request', 'alumni:reveal_approve',
    'import:create', 'import:read',
    'review:read', 'review:resolve',
    'campaign:read', 'dashboard:read'
  ],
  team_member: [
    'alumni:read', 'alumni:reveal_request',
    'import:read',
    'review:read',
    'dashboard:read'
  ],
};

const ROLE_HIERARCHY = {
  super_admin: 4,
  admin: 3,
  team_lead: 2,
  team_member: 1,
};

/**
 * Check if role has a specific permission.
 */
function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}

/**
 * Check if roleA is higher or equal to roleB in the hierarchy.
 */
function isRoleHigherOrEqual(roleA, roleB) {
  return (ROLE_HIERARCHY[roleA] || 0) >= (ROLE_HIERARCHY[roleB] || 0);
}

module.exports = { ROLES, ROLE_PERMISSIONS, ROLE_HIERARCHY, hasPermission, isRoleHigherOrEqual };
