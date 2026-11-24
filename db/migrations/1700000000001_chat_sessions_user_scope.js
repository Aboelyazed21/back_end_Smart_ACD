/**
 * Kept as a no-op so environments that already recorded this migration keep a
 * stable order. Its original change (scoping chat sessions to a student) was
 * folded into 1700000000000_init.js, which already creates
 * chat_sessions.student_id and its index.
 */
exports.up = async () => {
  // intentionally empty
};

exports.down = async () => {
  // intentionally empty
};
