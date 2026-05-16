# Custom Zone

Este diretório é reservado para suas customizações personalizadas.
Arquivos dentro desta pasta **NÃO** serão sobrescritos durante atualizações automáticas do Super Checkout.

### Como usar:
1. Crie seus componentes ou páginas aqui.
2. Importe-os usando o alias `@custom/`.
3. Use os hooks e contextos do `@/` (Core) normalmente.

Exemplo:
```tsx
import { MyCustomFeature } from '@custom/features/MyFeature';
```
