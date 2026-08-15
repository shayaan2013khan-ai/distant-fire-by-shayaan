import { createFileRoute } from "@tanstack/react-router";
import { AirshipGame } from "@/game/AirshipGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mayday" },
      { name: "description", content: "ATLA-inspired 2D hand-drawn airship combat. Joystick on mobile, WASD on desktop." },
      { property: "og:title", content: "Mayday" },
      { property: "og:description", content: "Pilot a Fire Nation airship through stormy skies and blast rival warships." },
    ],
  }),
  component: Index,
});

function Index() {
  return <AirshipGame />;
}
