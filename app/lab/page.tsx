import { redirect } from "next/navigation";
import { LAB_ENTRY } from "@/lib/site-map";

/** The site Overall Workflow is the map. /lab opens the first skill. */
export default function LabPage() {
  redirect(LAB_ENTRY.href);
}
