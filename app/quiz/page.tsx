import BouquetBuilder from "./BouquetBuilder";
import { getCatalog } from "@/lib/catalog";
import "./quiz.css";

export const metadata = {
  title: "Make Your Bouquet | The Perfect Bouquet",
  description: "Choose every little detail of your perfect bouquet.",
};

// Pricing comes from the database, so this page is rendered per-request.
export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const { flowers, wraps } = await getCatalog();
  return <BouquetBuilder flowers={flowers} wraps={wraps} />;
}
