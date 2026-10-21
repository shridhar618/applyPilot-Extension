import React from "react";
import { createRoot } from "react-dom/client";
import "../shared/styles.css";
import { SidePanel } from "./SidePanel";

createRoot(document.getElementById("root")!).render(<React.StrictMode><SidePanel /></React.StrictMode>);
