import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  socketId: { type: String, index: true },
  name: { type: String, required: true },
  googleId: { type: String, index: true, sparse: true },
  email: { type: String, sparse: true },
  avatar: { type: String },
  elo: { type: Number, default: 1200 },
  gamesPlayed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
