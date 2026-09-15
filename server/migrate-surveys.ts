/**
 * server/migrate-surveys.ts
 *
 * Standalone migration script to transfer all surveys from SQLite database to data/surveys/<id>.json
 */

import { SurveyService } from './survey-service';

console.info('Starting surveys migration from SQLite database to data/surveys/ ...');
const result = SurveyService.migrateSurveysFromDbToFileSystem();
console.info(`Migration finished. Migrated: ${result.migratedCount}, Skipped (already existed): ${result.skippedCount}`);
