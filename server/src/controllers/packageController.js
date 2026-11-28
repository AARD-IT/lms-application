const packageService = require('../services/packageService');
const activity = require('../services/activityService');

/**
 * GET /api/packages or /api/admin/packages
 * List all active packages with populated courses
 */
async function listPackages(req, res, next) {
  try {
    const packages = await packageService.getAllPackages();
    res.json(packages);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/packages/:id
 * Get package details by ID or identifier
 */
async function getPackage(req, res, next) {
  try {
    const pkg = await packageService.getPackageByIdOrIdentifier(req.params.id);
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }
    const resolvedCourses = await packageService.resolveCoursesForPackage(pkg);
    res.json({ package: pkg, courses: resolvedCourses });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/packages/:id/courses
 * Super Admin updates courses included in a package
 */
async function updatePackageCourses(req, res, next) {
  try {
    const { courseIds } = req.body || {};
    if (!Array.isArray(courseIds)) {
      return res.status(400).json({ error: 'courseIds must be an array of course IDs' });
    }

    const updated = await packageService.updatePackageCourses(req.params.id, courseIds, req.user);

    await activity.log(
      { user: req.user, ip: req.ip },
      {
        category: 'course',
        action: 'package.courses_updated',
        summary: `${req.user.name} updated courses for package "${updated.name}" (${courseIds.length} courses)`,
        entityType: 'package',
        entityId: updated._id,
      }
    );

    res.json({
      message: 'Package courses updated successfully',
      package: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPackages,
  getPackage,
  updatePackageCourses,
};
