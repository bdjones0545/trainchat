import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);

    const container = document.querySelector("[data-scroll-container]");
    if (container) container.scrollTop = 0;
  }, [location]);

  return null;
}
