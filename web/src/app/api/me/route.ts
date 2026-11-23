import { auth } from "@/lib/auth";
import { greenBalance } from "@/lib/green";
import { chargeOptions, paymentsReady } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { myItems } from "@/lib/shop";
import { unreadCount } from "@/lib/notes";

/** 공원 화면 상단: 내 그린·가방·상품 가격 */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const { shop, fountain, sound, controls, cat } = await getSettings();
  const isGuest = !!s.user.isAnonymous;
  return Response.json({
    isGuest,
    green: isGuest ? 0 : await greenBalance(s.user.id),
    items: isGuest ? { noteSheets: 0, mat: false } : await myItems(s.user.id),
    shop: { notebookPrice: shop.notebookPrice, notebookSheets: shop.notebookSheets, matPrice: shop.matPrice },
    charge: await chargeOptions(),
    paymentsReady: paymentsReady(),
    fountainPrice: fountain.coinPrice,
    sound,
    controls,
    cat,
    unreadNotes: await unreadCount(s.user.id),
  }, { headers: { "cache-control": "no-store" } });
}
