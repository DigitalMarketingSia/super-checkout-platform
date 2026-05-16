export const translatePaymentError = (errorCode?: string, declineCode?: string, defaultMessage?: string): string => {
   // Use decline_code if available, otherwise code
   const code = declineCode || errorCode;
   
   if (!code) {
       return defaultMessage || 'Não foi possível processar seu pagamento. Verifique os dados do cartão e tente novamente.';
   }

   switch (code) {
       case 'generic_decline':
           return 'Pagamento recusado pela administradora do cartão. Por favor, tente outro cartão ou entre em contato com seu banco.';
       case 'insufficient_funds':
           return 'O cartão informado não possui saldo ou limite suficiente para esta transação.';
       case 'lost_card':
           return 'Pagamento recusado: O cartão informado consta como perdido.';
       case 'stolen_card':
           return 'Pagamento recusado: O cartão informado consta como roubado.';
       case 'expired_card':
           return 'O cartão informado está vencido. Por favor, utilize um cartão válido.';
       case 'incorrect_cvc':
           return 'O código de segurança (CVC/CVV) está incorreto. Verifique o verso do seu cartão.';
       case 'processing_error':
           return 'Ocorreu um erro no processador de pagamentos. Por favor, tente novamente em alguns instantes.';
       case 'incorrect_number':
           return 'O número do cartão de crédito está incorreto ou é inválido.';
       case 'card_velocity_exceeded':
           return 'Limite de tentativas excedido para este cartão. Por favor, utilize outro cartão ou aguarde.';
       case 'card_declined':
           // If it's just card_declined but we have no specific decline_code
           return 'O pagamento foi recusado pelo banco emissor do cartão.';
       case 'expired_token':
           return 'Tempo limite de pagamento excedido. Por favor, recarregue a página e tente novamente.';
       case 'invalid_cvc':
           return 'O código de segurança (CVC/CVV) é inválido.';
       case 'invalid_expiry_year':
       case 'invalid_expiry_month':
           return 'A data de validade informada é inválida.';
       default:
           // If we have a default message from the gateway in English, try not to show it raw to users if possible,
           // but it's better than nothing if it's an edge case error.
           if (defaultMessage && defaultMessage.toLowerCase().includes('declined')) {
               return 'Pagamento recusado pela administradora do cartão.';
           }
           if (defaultMessage && defaultMessage.includes('insufficient funds')) {
               return 'O cartão não possui limite suficiente.';
           }
           if (defaultMessage && defaultMessage.includes('expired')) {
               return 'O cartão está vencido.';
           }
           if (defaultMessage && defaultMessage.includes('param:')) {
               return 'Favor verificar se todos os dados do cartão estão corretos.';
           }
           if (defaultMessage && defaultMessage.includes('transaction_amount')) {
               return 'Valor da transação inválido para o método de pagamento. (Para cartões, o valor mínimo geralmente é R$ 1,00).';
           }
           if (defaultMessage && defaultMessage.includes('security_code')) {
               return 'O código de segurança (CVC) fornecido é inválido.';
           }
           return defaultMessage || 'Não foi possível processar seu pagamento. Verifique os dados e tente novamente.';
   }
};
