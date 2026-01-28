// lib/config/jobProfiles.js
// Job profile definitions with budget and timing options
// These are used to show context-appropriate options based on the service type selected

/**
 * Job Profile Types:
 * - emergency_small: Urgent, small-scope problems (leaks, immediate faults)
 * - small_standard: Small, non-urgent jobs
 * - medium_job: Medium-scope work (installations, upgrades, major repairs)
 * - renovation_large: Major renovation/refit work
 */

// Budget options for each job profile
export const JOB_PROFILE_BUDGETS = {
  emergency_small: [
    { id: "under_250", label: "Under £250", value: "<£250" },
    { id: "250_500", label: "£250 – £500", value: "£250–£500" },
    { id: "500_1000", label: "£500 – £1,000", value: "£500–£1k" },
    { id: "not_sure", label: "Not sure", value: "Not specified" },
  ],
  small_standard: [
    { id: "under_250", label: "Under £250", value: "<£250" },
    { id: "250_500", label: "£250 – £500", value: "£250–£500" },
    { id: "500_1000", label: "£500 – £1,000", value: "£500–£1k" },
    { id: "not_sure", label: "Not sure", value: "Not specified" },
  ],
  medium_job: [
    { id: "500_1000", label: "£500 – £1,000", value: "£500–£1k" },
    { id: "1000_3000", label: "£1,000 – £3,000", value: "£1k–£3k" },
    { id: "3000_7500", label: "£3,000 – £7,500", value: "£3k–£7.5k" },
    { id: "7500_15000", label: "£7,500 – £15,000", value: "£7.5k–£15k" },
    { id: "not_sure", label: "Not sure", value: "Not specified" },
  ],
  renovation_large: [
    { id: "3000_7500", label: "£3,000 – £7,500", value: "£3k–£7.5k" },
    { id: "7500_15000", label: "£7,500 – £15,000", value: "£7.5k–£15k" },
    { id: "over_15000", label: "£15,000+", value: ">£15k" },
    { id: "not_sure", label: "Not sure", value: "Not specified" },
  ],
};

// Timing options for each job profile
// Note: These are static options that don't require database lookup
export const JOB_PROFILE_TIMINGS = {
  emergency_small: [
    { id: "asap", name: "As soon as possible", description: "Need help urgently", is_emergency: true },
    { id: "few_days", name: "Within a few days", description: "Fairly urgent", is_emergency: false },
  ],
  small_standard: [
    { id: "few_days", name: "Within a few days", description: "Fairly urgent", is_emergency: false },
    { id: "within_week", name: "Within a week", description: "Would like work done soon", is_emergency: false },
    { id: "flexible", name: "Flexible", description: "No rush, get quotes at your convenience", is_emergency: false },
  ],
  medium_job: [
    { id: "within_week", name: "Within a week", description: "Would like work done soon", is_emergency: false },
    { id: "flexible", name: "Flexible", description: "No rush, get quotes at your convenience", is_emergency: false },
    { id: "specific_date", name: "Specific date", description: "Have a particular date in mind", is_emergency: false },
  ],
  renovation_large: [
    { id: "asap_availability", name: "As soon as availability allows", description: "Ready to start when you are", is_emergency: false },
    { id: "under_2_weeks", name: "Under 2 weeks", description: "Would like to start soon", is_emergency: false },
    { id: "in_a_month", name: "In a month", description: "Planning ahead", is_emergency: false },
    { id: "more_than_2_months", name: "More than 2 months", description: "Long-term planning", is_emergency: false },
  ],
};

// Default fallback profile for service types without a profile
export const DEFAULT_JOB_PROFILE = "small_standard";

/**
 * Get budget options for a job profile
 * @param {string} jobProfile - The job profile type
 * @returns {Array} Budget options array
 */
export function getBudgetOptionsForProfile(jobProfile) {
  return JOB_PROFILE_BUDGETS[jobProfile] || JOB_PROFILE_BUDGETS[DEFAULT_JOB_PROFILE];
}

/**
 * Get timing options for a job profile
 * @param {string} jobProfile - The job profile type
 * @returns {Array} Timing options array
 */
export function getTimingOptionsForProfile(jobProfile) {
  return JOB_PROFILE_TIMINGS[jobProfile] || JOB_PROFILE_TIMINGS[DEFAULT_JOB_PROFILE];
}

/**
 * Get the job profile for a service type
 * Falls back to default if not specified
 * @param {Object} serviceType - Service type object with job_profile field
 * @returns {string} Job profile type
 */
export function getJobProfileForServiceType(serviceType) {
  return serviceType?.job_profile || DEFAULT_JOB_PROFILE;
}

export default {
  JOB_PROFILE_BUDGETS,
  JOB_PROFILE_TIMINGS,
  DEFAULT_JOB_PROFILE,
  getBudgetOptionsForProfile,
  getTimingOptionsForProfile,
  getJobProfileForServiceType,
};
