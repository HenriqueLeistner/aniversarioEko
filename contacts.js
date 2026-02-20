// ============================================
// EkoBrazil - Base padrão de aniversariantes
// ============================================
// Este arquivo contém apenas a "base de dados" inicial utilizada
// pelo painel. Ele é carregado antes do script principal
// (script.js) e expõe uma constante global `CONTACTS`.
//
// Em produção, estes dados poderiam vir de uma API ou banco
// de dados. Aqui mantemos em um array simples para facilitar
// testes locais e evitar que o script principal fique grande.
// ============================================

/**
 * Base de dados simples de aniversariantes (padrão do sistema).
 *
 * - name: nome da pessoa
 * - phone: telefone em formato internacional (sem +, apenas números)
 *   Exemplo Brasil: 55 + DDD + número -> 5511999999999
 * - birthday: data de nascimento no formato DD/MM (sem ano)
 */
const CONTACTS = [
  
];

