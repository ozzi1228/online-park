import { auth } from "@/lib/auth";
import { greenBalance } from "@/lib/green";
import { chargeOptions, paymentsReady } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { getMessageOverrides } from "@/lib/content";
import { grantStarter, myItems } from "@/lib/shop";
import { unreadCount } from "@/lib/notes";

/** 공원 화면 상단: 내 그린·가방·상품 가격 */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const { shop, fountain, sound, controls, cat } = await getSettings();
  const isGuest = !!s.user.isAnonymous;
  const starter = s.user.characterLockedAt ? await grantStarter(s.user.id) : false; // 처음 들어온 사람에게 시작 선물 (한 번만)
  return Response.json({
    isGuest,
    starter,
    green: await greenBalance(s.user.id),
    items: await myItems(s.user.id),
    shop: { notebookPrice: shop.notebookPrice, notebookSheets: shop.notebookSheets, matPrice: shop.matPrice, churuPrice: shop.churuPrice, churuPack: shop.churuPack, rodPrice: shop.rodPrice, rodUses: shop.rodUses },
    charge: await chargeOptions(),
    paymentsReady: paymentsReady(),
    fountainPrice: fountain.coinPrice,
    fountain: { rewardOuter: fountain.rewardOuter, rewardMid: fountain.rewardMid, rewardBull: fountain.rewardBull, midPct: fountain.midPct, bullPct: fountain.bullPct },
    sound,
    controls,
    cat,
    unreadNotes: await unreadCount(s.user.id),
    messages: await getMessageOverrides(), // 관리자가 고친 안내 멘트 (나머지는 화면의 기본값)
  }, { headers: { "cache-control": "no-store" } });
}
