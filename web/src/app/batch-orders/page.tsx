export { privateMetadata as metadata } from "@/features/store/seo";
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/?type=BATCH");
}
