import { OrderStatus, InstallmentOption } from '../../types';

/**
 * STRIPE ADAPTER (PRODUÇÃO)
 *
 * Versão refatorada para produção.
 * - Tokenização: Feita via Stripe Elements no frontend (seguro)
 * - PaymentIntent: Criado via Serverless Function no backend (seguro)
 * - Este adapter agora contém apenas:
 *   1. Motor financeiro de parcelamentos (Tabela Price)
 *   2. Tradução de status Stripe → interno
 */
export class StripeAdapter {

    /**
     * Simulador Financeiro Próprio (Stripe Fallback)
     * Como o Stripe não tem API de `/installments` simples igual o MP,
     * calculamos parcelas via Juros Compostos / Tabela Price.
     */
    getInstallments(
        amount: number,
        maxInstallments: number = 12,
        interestRateMonth: number = 2.99,
        minInstallmentAmount: number = 5.00
    ): InstallmentOption[] {
        const options: InstallmentOption[] = [];

        // 1x sempre sem juros na matemática base
        options.push({
            installments: 1,
            installmentAmount: amount,
            totalAmount: amount,
            label: `1x de R$ ${amount.toFixed(2).replace('.', ',')} (À vista)`
        });

        // Loop de 2x a N
        for (let i = 2; i <= maxInstallments; i++) {
            // Se juros zero, divide reto
            if (interestRateMonth <= 0) {
                const installmentAmount = amount / i;

                // Pular se a parcela for menor que o mínimo
                if (installmentAmount < minInstallmentAmount) continue;

                options.push({
                    installments: i,
                    installmentAmount: installmentAmount,
                    totalAmount: amount,
                    label: `${i}x de R$ ${installmentAmount.toFixed(2).replace('.', ',')} (Sem juros)`
                });
                continue;
            }

            // Tabela Price: PMT = PV * [ i * (1 + i)^n ] / [ (1 + i)^n - 1 ]
            const iRate = interestRateMonth / 100;
            const pmt = amount * (iRate * Math.pow(1 + iRate, i)) / (Math.pow(1 + iRate, i) - 1);

            // Pular se a parcela for menor que o mínimo
            if (pmt < minInstallmentAmount) continue;

            const total = pmt * i;

            options.push({
                installments: i,
                installmentAmount: pmt,
                totalAmount: total,
                label: `${i}x de R$ ${pmt.toFixed(2).replace('.', ',')} (Com juros)`
            });
        }

        return options;
    }

    /**
     * Traduz o status do webhook do Stripe (PaymentIntent) para o formato interno
     */
    translateStatus(stripeStatus: string): OrderStatus {
        const statusMap: Record<string, OrderStatus> = {
            'succeeded': OrderStatus.PAID,
            'processing': OrderStatus.PENDING,
            'requires_payment_method': OrderStatus.FAILED,
            'requires_action': OrderStatus.PENDING,
            'canceled': OrderStatus.CANCELED,
        };
        return statusMap[stripeStatus] || OrderStatus.PENDING;
    }
}
