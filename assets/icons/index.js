// assets/icons/index.js
// Icon mapping for service categories and service types
// Maps database names to local PNG icon files

// Category icons - keyed by category name (exact match from database)
export const categoryIcons = {
  'Plumbing': require('./categories/plumbing.png'),
  'Electrical': require('./categories/electrical.png'),
  'Bathroom': require('./categories/bathroom.png'),
  'Kitchen': require('./categories/kitchen.png'),
  'Cleaning': require('./categories/cleaning.png'),
  'Handyman': require('./categories/handyman.png'),
};

// Service type icons - keyed by service type name (exact match from database)
// Some service types share the same icon (e.g., "New installation", "Something else")
export const serviceTypeIcons = {
  // Plumbing services
  'Leak or drip': require('./services/leak-or-drip.png'),
  'Blocked drain': require('./services/blocked-drain.png'),
  'Toilet problem': require('./services/toilet-problem.png'),
  'Boiler / heating': require('./services/boiler-heating.png'),

  // Electrical services
  'Socket or switch issue': require('./services/socket-or-switch.png'),
  'Lighting problem': require('./services/lighting-problem.png'),
  'Fuse box / consumer unit': require('./services/fuse-box.png'),
  'Rewiring': require('./services/rewiring.png'),

  // Bathroom services
  'Full bathroom refit': require('./services/full-bathroom-refit.png'),
  'Shower installation': require('./services/shower-installation.png'),
  'Bath installation': require('./services/bath-installation.png'),
  'Tiling': require('./services/tiling-bathroom.png'),
  'Plumbing work': require('./services/plumbing-work.png'),

  // Kitchen services
  'Full kitchen refit': require('./services/full-kitchen-refit.png'),
  'Appliance installation': require('./services/appliance-installation.png'),
  'Worktop replacement': require('./services/worktop-replacement.png'),
  'Cabinet fitting': require('./services/cabinet-fitting.png'),
  'Tiling / splashback': require('./services/tiling-splashback.png'),

  // Cleaning services
  'Deep clean': require('./services/deep-clean.png'),
  'End of tenancy': require('./services/end-of-tenancy.png'),
  'Carpet cleaning': require('./services/carpet-cleaning.png'),
  'Window cleaning': require('./services/window-cleaning.png'),
  'Regular cleaning': require('./services/regular-cleaning.png'),

  // Handyman services
  'Furniture assembly': require('./services/furniture-assembly.png'),
  'Painting / decorating': require('./services/painting-decorating.png'),
  'Shelving / mounting': require('./services/shelving-mounting.png'),
  'Door / window repair': require('./services/door-window-repair.png'),
  'General repairs': require('./services/general-repairs.png'),

  // Shared service types (appear in multiple categories)
  'New installation': require('./services/new-installation.png'),
  'Something else': require('./services/something-else.png'),
};

// Helper function to get category icon by name
export function getCategoryIcon(categoryName) {
  return categoryIcons[categoryName] || null;
}

// Helper function to get service type icon by name
export function getServiceTypeIcon(serviceTypeName) {
  return serviceTypeIcons[serviceTypeName] || null;
}

// Default fallback icons (optional - uses the same icons)
export const defaultCategoryIcon = require('./services/something-else.png');
export const defaultServiceTypeIcon = require('./services/something-else.png');
