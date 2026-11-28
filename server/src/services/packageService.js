const Package = require('../models/Package');
const Course = require('../models/Course');

/**
 * Predefined package definitions matching LMS requirements:
 * Tier 1: Core Skills (SQL, Python, Power BI)
 * Tier 2: Advanced Skills (Data Science, Generative AI)
 * Tier 3: Full LMS (All eligible published courses)
 */
const DEFAULT_PACKAGE_DEFINITIONS = [
  {
    name: 'Core Skills Package',
    slug: 'core-skills-package',
    identifier: 'core-skills',
    tier: 1,
    description: 'Comprehensive foundational skills in SQL, Python for Data Analytics, and Power BI Data Visualization.',
    matchKeywords: ['sql', 'python', 'power bi', 'power-bi'],
    isFullAccess: false,
    price: 4999,
    features: [
      'SQL – Database Management & Querying',
      'Python – Introduction to Data Analytics Using Python',
      'Power BI – Data Visualization & Business Intelligence',
      'Hands-on exercises and interview question banks',
      'Verified completion certificate',
    ],
  },
  {
    name: 'Advanced Skills Package',
    slug: 'advanced-skills-package',
    identifier: 'advanced-skills',
    tier: 2,
    description: 'Cutting-edge specialization in Data Science and Generative AI & Prompt Engineering Masterclass.',
    matchKeywords: ['data science', 'data-science', 'generative ai', 'generative-ai', 'prompt engineering'],
    isFullAccess: false,
    price: 7999,
    features: [
      'Data Science & Predictive Modeling',
      'Generative AI & Prompt Engineering Masterclass',
      'Advanced projects and case studies',
      'Direct mentor support and code reviews',
    ],
  },
  {
    name: 'Full LMS Package',
    slug: 'full-lms-package',
    identifier: 'full-lms',
    tier: 3,
    description: 'Unrestricted access to all eligible published courses, learning modules, resources, and assessments.',
    matchKeywords: [],
    isFullAccess: true,
    price: 11999,
    features: [
      'All published courses across the entire LMS',
      'All study materials, PDFs, documents, and datasets',
      'Continuous access to new lessons and updates',
      'Priority assessment reviews and certifications',
    ],
  },
];

/**
 * Ensures the three database-driven package configurations exist.
 * Dynamically associates actual database course IDs based on course titles and slugs.
 */
async function ensureDefaultPackages() {
  try {
    const allCourses = await Course.find({}).select('_id title slug published');
    const publishedCourses = allCourses.filter((c) => c.published !== false);

    for (const def of DEFAULT_PACKAGE_DEFINITIONS) {
      let matchedCourseIds = [];

      if (def.isFullAccess) {
        matchedCourseIds = publishedCourses.map((c) => c._id);
      } else {
        matchedCourseIds = allCourses
          .filter((course) => {
            const titleLower = (course.title || '').toLowerCase();
            const slugLower = (course.slug || '').toLowerCase();
            return def.matchKeywords.some(
              (kw) => titleLower.includes(kw) || slugLower.includes(kw)
            );
          })
          .map((c) => c._id);
      }

      const existing = await Package.findOne({ identifier: def.identifier });
      if (!existing) {
        await Package.create({
          name: def.name,
          slug: def.slug,
          identifier: def.identifier,
          tier: def.tier,
          description: def.description,
          courses: matchedCourseIds,
          isFullAccess: def.isFullAccess,
          status: 'active',
          price: def.price,
          features: def.features,
        });
      } else {
        // Update course inclusions if package currently has no courses assigned or new courses exist
        if ((!existing.courses || existing.courses.length === 0) && matchedCourseIds.length > 0) {
          existing.courses = matchedCourseIds;
          await existing.save();
        }
      }
    }
  } catch (err) {
    console.error('Failed to ensure default packages:', err.message);
  }
}

/**
 * Get all packages with populated course details.
 */
async function getAllPackages() {
  await ensureDefaultPackages();
  return Package.find({ status: 'active' })
    .populate('courses', 'title slug category thumbnail price level hours published')
    .sort({ tier: 1 });
}

/**
 * Get a package by ID or identifier.
 */
async function getPackageByIdOrIdentifier(idOrIdentifier) {
  await ensureDefaultPackages();
  let pkg;
  if (/^[0-9a-fA-F]{24}$/.test(idOrIdentifier)) {
    pkg = await Package.findById(idOrIdentifier).populate(
      'courses',
      'title slug category thumbnail price level hours published'
    );
  }
  if (!pkg) {
    pkg = await Package.findOne({ identifier: idOrIdentifier.toLowerCase() }).populate(
      'courses',
      'title slug category thumbnail price level hours published'
    );
  }
  return pkg;
}

/**
 * Dynamically resolves the list of course ObjectIds and Course objects included in a package.
 * For Full LMS package, dynamically queries all current published courses so new courses are automatically included.
 */
async function resolveCoursesForPackage(packageDoc) {
  if (!packageDoc) return [];

  if (packageDoc.isFullAccess) {
    const publishedCourses = await Course.find({ published: { $ne: false } }).select(
      '_id title slug category price thumbnail'
    );
    return publishedCourses;
  }

  const courseIds = (packageDoc.courses || []).map((c) => (c._id ? c._id : c));
  const courses = await Course.find({ _id: { $in: courseIds } }).select(
    '_id title slug category price thumbnail'
  );
  return courses;
}

/**
 * Admin updates package course inclusions.
 */
async function updatePackageCourses(packageId, courseIds, adminUser) {
  const pkg = await Package.findById(packageId);
  if (!pkg) {
    throw new Error('Package not found');
  }

  // Validate all course IDs exist
  const existingCourses = await Course.find({ _id: { $in: courseIds } }).select('_id');
  if (existingCourses.length !== courseIds.length) {
    throw new Error('One or more selected course IDs do not exist');
  }

  pkg.courses = courseIds;
  if (adminUser) pkg.updatedBy = adminUser._id;
  await pkg.save();

  return Package.findById(pkg._id).populate(
    'courses',
    'title slug category thumbnail price level hours published'
  );
}

module.exports = {
  ensureDefaultPackages,
  getAllPackages,
  getPackageByIdOrIdentifier,
  resolveCoursesForPackage,
  updatePackageCourses,
  DEFAULT_PACKAGE_DEFINITIONS,
};
