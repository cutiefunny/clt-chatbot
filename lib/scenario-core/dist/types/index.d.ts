export interface ScenarioNode {
    id: string;
    type: string;
    data: any;
    parentNode?: string;
}
export interface ScenarioEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
}
export interface ScenarioData {
    version: string;
    nodes: ScenarioNode[];
    edges: ScenarioEdge[];
    startNodeId?: string | null;
}
