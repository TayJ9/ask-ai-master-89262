/**
 * Maps academic year to interview question difficulty parameters.
 * Used to tailor ElevenLabs agent questions based on student level.
 * Logic extracted from backend/voiceServer.js for consistency.
 */

export interface YearToDifficultyResult {
  technicalDifficulty: string;
  technicalDepth: string;
  behavioralRatio: number;
}

/**
 * Get question-tailoring parameters based on academic year.
 * Higher years (Senior, Post Grad) get more technical, advanced questions;
 * lower years (Freshman, High School) get more foundational, behavioral questions.
 */
export function getYearToDifficulty(year: string | undefined): YearToDifficultyResult {
  const yearLower = (year || '').toLowerCase();
  let technicalDifficulty = 'moderate';
  let technicalDepth = 'intermediate';
  let behavioralRatio = 50;

  if (yearLower.includes('high school')) {
    technicalDifficulty = 'foundational';
    technicalDepth = 'basic';
    behavioralRatio = 70;
  } else if (yearLower.includes('freshman')) {
    technicalDifficulty = 'basic';
    technicalDepth = 'introductory';
    behavioralRatio = 65;
  } else if (yearLower.includes('sophomore')) {
    technicalDifficulty = 'basic-intermediate';
    technicalDepth = 'foundational';
    behavioralRatio = 60;
  } else if (yearLower.includes('junior')) {
    technicalDifficulty = 'intermediate';
    technicalDepth = 'moderate';
    behavioralRatio = 50;
  } else if (yearLower.includes('senior')) {
    technicalDifficulty = 'intermediate-advanced';
    technicalDepth = 'advanced';
    behavioralRatio = 45;
  } else if (yearLower.includes('post grad') || yearLower.includes('postgrad') || yearLower.includes('graduate')) {
    technicalDifficulty = 'advanced';
    technicalDepth = 'expert';
    behavioralRatio = 40;
  }

  return { technicalDifficulty, technicalDepth, behavioralRatio };
}
