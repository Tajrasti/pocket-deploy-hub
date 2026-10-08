// Address of the PhoneDeploy server. When the dashboard is served by the server itself
// (http://PHONE_IP:3001) it uses the same address; otherwise set VITE_API_URL.
export const API_BASE: string =
  import.meta.env.VITE_API_URL ||
  (window.location.port === "3001" ? window.location.origin : "http://localhost:3001");
