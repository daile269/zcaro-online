import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  sender: { type: String },
  message: { type: String },
  socketId: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
});

export default mongoose.models.ChatMessage ||
  mongoose.model("ChatMessage", ChatMessageSchema);
