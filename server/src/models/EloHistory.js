import mongoose from "mongoose";

const EloHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  opponentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  before: { type: Number, required: true },
  after: { type: Number, required: true },
  change: { type: Number, required: true },
  result: { type: String, enum: ["win", "loss", "draw"], required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.models.EloHistory ||
  mongoose.model("EloHistory", EloHistorySchema);
