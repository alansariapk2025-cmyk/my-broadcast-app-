/** Primary shop — restore name when Firestore shops/ doc was deleted */
export const PRIMARY_SHOP_ID = "xKUNJfO0kSZK4yCEhh8s";
export const PRIMARY_SHOP_NAME = "RAFY ANSARI SHOP";

export const KNOWN_SHOP_NAMES = {
  [PRIMARY_SHOP_ID]: PRIMARY_SHOP_NAME,
};

export function resolveShopDisplayName(shopId, nameMap = {}, existingName = "") {
  const trimmed = (existingName || "").trim();
  if (trimmed && trimmed !== "Unknown Shop") return trimmed;
  if (shopId && nameMap[shopId]) return nameMap[shopId];
  if (shopId && KNOWN_SHOP_NAMES[shopId]) return KNOWN_SHOP_NAMES[shopId];
  if (shopId) return "Unknown Shop";
  return "—";
}
