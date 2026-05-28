/**
 * modules/roles/roles.controller.js
 * ─────────────────────────────────────────────────────────
 * Request handlers for role profile management.
 */

const rolesModel = require('./roles.model');
const { success } = require('../../utils/apiResponse');
const { validateRequired, isValidUUID } = require('../../utils/validators');
const { NotFoundError, ValidationError, ConflictError, PermissionError } = require('../../utils/errors');
const { invalidatePermissionCache } = require('../../middlewares/rbacValidator');
const { auditLog } = require('../../middlewares/auditLogger');

/**
 * GET /api/roles
 */
async function list(req, res, next) {
  try {
    const roles = await rolesModel.listRoles(req.tenantId);
    return success(res, roles, 'Roles retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/roles
 */
async function create(req, res, next) {
  try {
    const { role_name, permissions } = req.body;
    validateRequired(req.body, ['role_name', 'permissions']);

    if (typeof permissions !== 'object') {
      throw new ValidationError('Permissions must be a valid JSON object');
    }

    const role = await rolesModel.createRole(req.tenantId, {
      roleName: role_name,
      permissions,
    });

    auditLog(req, 'CREATE', 'role_profile', role.id, null, role);

    return success(res, role, 'Role created successfully', {}, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/roles/:id
 */
async function update(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid role ID');
    }

    const before = await rolesModel.getRoleById(req.tenantId, req.params.id);
    if (!before) {
      throw new NotFoundError('Role not found');
    }

    const { role_name, permissions } = req.body;

    const role = await rolesModel.updateRole(req.tenantId, req.params.id, {
      roleName: role_name,
      permissions,
    });

    if (!role) {
      throw new NotFoundError('Role not found');
    }

    // Invalidate Redis permission cache for all users with this role
    await invalidatePermissionCache(req.tenantId, req.params.id);

    auditLog(req, 'UPDATE', 'role_profile', role.id, before, role);

    return success(res, role, 'Role updated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/roles/:id
 */
async function remove(req, res, next) {
  try {
    if (!isValidUUID(req.params.id)) {
      throw new ValidationError('Invalid role ID');
    }

    const role = await rolesModel.getRoleById(req.tenantId, req.params.id);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    // Cannot delete system roles
    if (role.is_system_role) {
      throw new PermissionError('Cannot delete system roles (Admin, Manager, Member)');
    }

    // Cannot delete if users are assigned
    const userCount = await rolesModel.countUsersWithRole(req.tenantId, req.params.id);
    if (userCount > 0) {
      throw new ConflictError(`Cannot delete role: ${userCount} user(s) are assigned to it`);
    }

    await rolesModel.deleteRole(req.tenantId, req.params.id);

    auditLog(req, 'DELETE', 'role_profile', req.params.id, role, null);

    return success(res, null, 'Role deleted successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/roles/permissions-schema
 */
async function permissionsSchema(req, res, next) {
  try {
    const schema = rolesModel.getPermissionsSchema();
    return success(res, schema, 'Permissions schema retrieved');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
  permissionsSchema,
};
