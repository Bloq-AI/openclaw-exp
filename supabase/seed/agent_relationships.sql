-- Seed 15 agent pairs with initial affinities
-- Agents: strategist, hype, critic, builder, creative, analyst
-- Constraint: agent_a < agent_b (alphabetical)
INSERT INTO ops_agent_relationships (agent_a, agent_b, affinity) VALUES
('analyst',    'builder',     0.60),
('analyst',    'creative',    0.40),
('analyst',    'critic',      0.70),
('analyst',    'hype',        0.35),
('analyst',    'strategist',  0.75),
('builder',    'creative',    0.55),
('builder',    'critic',      0.50),
('builder',    'hype',        0.45),
('builder',    'strategist',  0.65),
('creative',   'critic',      0.35),
('creative',   'hype',        0.70),
('creative',   'strategist',  0.55),
('critic',     'hype',        0.30),
('critic',     'strategist',  0.60),
('hype',       'strategist',  0.50)
ON CONFLICT (agent_a, agent_b) DO NOTHING;
