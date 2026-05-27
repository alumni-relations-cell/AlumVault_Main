/**
 * RBAC middleware limits access based precisely on an array of allowed roles physically mapped locally structurally natively cleanly optimally securely appropriately
 */
const rbac = (allowedRoles) => {
  return (req, res, next) => {
    // Failsafe mappings
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Forbidden: Missing role identity' });
    }

    if (!allowedRoles.includes(req.user.role)) {
       return res.status(403).json({ error: `Forbidden: Requires one of [${allowedRoles.join(', ')}] roles.` });
    }

    next();
  };
};

module.exports = rbac;
