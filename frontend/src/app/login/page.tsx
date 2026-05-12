"use client";

import { useEffect } from "react";

// Redirect /login to / since login is now the home page
export default function LoginRedirect() {
  useEffect(() => {
    window.location.href = "/";
  }, []);

  return null;
}
