-- Usuário MySQL SOMENTE LEITURA do assistente de IA.
-- Rode UMA vez, como root (ou outro administrador do MySQL), DEPOIS de "alembic upgrade head" (as views precisam existir).
-- Troque SENHA_FORTE_AQUI e o nome do banco (DB_NAME do seu .env), e use a mesma senha em IA_DB_PASSWORD.
-- Para repetir: DROP USER 'sistema_ia'@'%'; e rode de novo.

CREATE USER IF NOT EXISTS 'sistema_ia'@'%' IDENTIFIED BY 'IaUser@2026';
ALTER USER 'sistema_ia'@'%' IDENTIFIED BY 'IaUser@2026'
    WITH MAX_USER_CONNECTIONS 5;

-- SELECT apenas nas views (nunca nas tabelas). Troque nova_sorvetes pelo nome do seu banco.
GRANT SELECT ON sist_gest_est_mon.v_produtos        TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_clientes        TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_fornecedores    TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_geladeiras      TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_manutencoes     TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_vendas          TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_venda_itens     TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_venda_margem    TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_compras         TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_compra_itens    TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_cotacao_itens   TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_receitas        TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_producao        TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_titulos         TO 'sistema_ia'@'%';
GRANT SELECT ON sist_gest_est_mon.v_baixas          TO 'sistema_ia'@'%';
FLUSH PRIVILEGES;
