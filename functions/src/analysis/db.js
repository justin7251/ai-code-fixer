const admin = require('firebase-admin');
const db = admin.firestore();

// Export database operations
exports.saveAnalysisResults = async (userId, resultData) => {
  // Your existing code to save results
  return db.collection('analysis_results')
    .add({
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...resultData
    });
};

exports.getAnalysisResults = async (resultId, userId) => {
  // Your existing code to retrieve results
  const doc = await db.collection('analysis_results').doc(resultId).get();
  
  if (!doc.exists) {
    throw new Error('Results not found');
  }
  
  const data = doc.data();
  
  // Optional security check
  if (data.userId !== userId) {
    throw new Error('Unauthorized access to results');
  }
  
  return data;
}; 