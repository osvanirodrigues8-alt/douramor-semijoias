import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncNuvemshopProducts } from "./nuvemshop-sync.server";

export const syncProdutosNuvemshop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return syncNuvemshopProducts();
  });
