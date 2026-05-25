export const translatePaymentError = (errorCode?: string, declineCode?: string, defaultMessage?: string): string => {
   const code = declineCode || errorCode;

   if (!code) {
      if (defaultMessage && (
         defaultMessage.includes('Failed to tokenize card')
         || defaultMessage.includes('nao retornou token')
         || defaultMessage.includes('empty error')
      )) {
         return 'Nao foi possivel validar os dados do cartao com o Mercado Pago. Revise os dados e tente novamente.';
      }

      return defaultMessage || 'Nao foi possivel processar seu pagamento. Verifique os dados do cartao e tente novamente.';
   }

   switch (code) {
      case 'generic_decline':
         return 'Pagamento recusado pela administradora do cartao. Por favor, tente outro cartao ou entre em contato com seu banco.';
      case 'insufficient_funds':
         return 'O cartao informado nao possui saldo ou limite suficiente para esta transacao.';
      case 'lost_card':
         return 'Pagamento recusado: o cartao informado consta como perdido.';
      case 'stolen_card':
         return 'Pagamento recusado: o cartao informado consta como roubado.';
      case 'expired_card':
         return 'O cartao informado esta vencido. Por favor, utilize um cartao valido.';
      case 'incorrect_cvc':
         return 'O codigo de seguranca (CVC/CVV) esta incorreto. Verifique o verso do seu cartao.';
      case 'processing_error':
         return 'Ocorreu um erro no processador de pagamentos. Por favor, tente novamente em alguns instantes.';
      case 'incorrect_number':
         return 'O numero do cartao de credito esta incorreto ou e invalido.';
      case 'card_velocity_exceeded':
         return 'Limite de tentativas excedido para este cartao. Por favor, utilize outro cartao ou aguarde.';
      case 'card_declined':
         return 'O pagamento foi recusado pelo banco emissor do cartao.';
      case 'expired_token':
         return 'Tempo limite de pagamento excedido. Por favor, recarregue a pagina e tente novamente.';
      case 'invalid_cvc':
         return 'O codigo de seguranca (CVC/CVV) e invalido.';
      case 'invalid_expiry_year':
      case 'invalid_expiry_month':
         return 'A data de validade informada e invalida.';
      default:
         if (defaultMessage && defaultMessage.toLowerCase().includes('declined')) {
            return 'Pagamento recusado pela administradora do cartao.';
         }
         if (defaultMessage && defaultMessage.includes('insufficient funds')) {
            return 'O cartao nao possui limite suficiente.';
         }
         if (defaultMessage && defaultMessage.includes('expired')) {
            return 'O cartao esta vencido.';
         }
         if (defaultMessage && defaultMessage.includes('param:')) {
            return 'Favor verificar se todos os dados do cartao estao corretos.';
         }
         if (defaultMessage && defaultMessage.includes('transaction_amount')) {
            return 'Valor da transacao invalido para o metodo de pagamento. Para cartoes, o valor minimo geralmente e R$ 1,00.';
         }
         if (defaultMessage && defaultMessage.includes('security_code')) {
            return 'O codigo de seguranca (CVC) fornecido e invalido.';
         }
         if (defaultMessage && (
            defaultMessage.includes('Failed to tokenize card')
            || defaultMessage.includes('nao retornou token')
            || defaultMessage.includes('empty error')
         )) {
            return 'Nao foi possivel validar os dados do cartao com o Mercado Pago. Revise os dados e tente novamente.';
         }
         return defaultMessage || 'Nao foi possivel processar seu pagamento. Verifique os dados e tente novamente.';
   }
};
