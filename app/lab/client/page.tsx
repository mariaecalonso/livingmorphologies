import { HomeClient } from "@/components/home-client";
import "./client-lab.css";

export default function ClientLabPage() {
  return (
    <div className="lab-client-stage">
      <div className="lab-client-frame">
        <HomeClient />
      </div>
    </div>
  );
}
