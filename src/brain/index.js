// ============================================
// brain/index.js — barrel export
//
// This entire directory is the "brain" pulled out of the original app:
// pure functions and static data, with zero DOM/canvas/fetch dependencies
// (importParsing.js is the one exception, and only for FileReader/SheetJS,
// which are unavoidable to actually read an uploaded file). Every function
// here is (data) -> data and can be unit tested or reused in any UI layer.
// ============================================

export * from './constants.js';
export * from './datetime.js';
export * from './defectRow.js';
export * from './metrics.js';
export * from './filters.js';
export * from './paretoAndComponents.js';
export * from './timeAnalysis.js';
export * from './defectLibrary.js';
export * from './capaLogic.js';
export * from './reportData.js';
export * from './importParsing.js';
export * from './equipmentLogic.js';

export * from './dataHealth.js';
