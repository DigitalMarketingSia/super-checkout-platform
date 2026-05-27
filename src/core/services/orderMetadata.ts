type SupabaseAdmin = any;

export function normalizeOrderMetadata(value: unknown): Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, any>) }
    : {};
}

export async function loadOrderMetadata(
  supabaseAdmin: SupabaseAdmin,
  orderId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('metadata')
    .eq('id', orderId)
    .single();

  if (error) {
    throw new Error(`Failed to load metadata for order ${orderId}: ${error.message}`);
  }

  return normalizeOrderMetadata(data?.metadata);
}

export async function mergeOrderMetadata(
  supabaseAdmin: SupabaseAdmin,
  orderId: string,
  partial: Record<string, any>,
) {
  const currentMetadata = await loadOrderMetadata(supabaseAdmin, orderId);
  const nextMetadata = {
    ...currentMetadata,
    ...partial,
  };

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ metadata: nextMetadata })
    .eq('id', orderId);

  if (error) {
    throw new Error(`Failed to update metadata for order ${orderId}: ${error.message}`);
  }

  return nextMetadata;
}
