import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // cho phép truy cập từ bên ngoài
    allowedHosts: ["vncaro.com"], // 👈 thêm dòng này
    port: 5173,
  },
});
