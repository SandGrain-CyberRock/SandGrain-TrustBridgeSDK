import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity("trace_log")
export class TraceLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: true })
    edge_node_id: string | null;

    @Column({ type: "varchar", nullable: true })
    event_scope: "edge_node" | "leaf" | "device" | null;

    @Column({ nullable: true })
    leaf_id: string | null;

    @Column({ nullable: true })
    app_seq_scope: string | null;

    @Column({ type: "int", nullable: true })
    app_message_seq: number | null;

    @Column()
    process_type: string;

    @Column()
    step: string;

    @Column()
    status: string;

    @Column({ type: "text", nullable: true })
    message: string | null;

    @Column({ type: "json", nullable: true })
    request_data: any;

    @Column({ type: "json", nullable: true })
    response_data: any;

    @Column({ type: "int", nullable: true })
    duration_ms: number | null;

    @Column({ type: "int" })
    attempt_number: number;

    @Column()
    local_timestamp: string;

    @CreateDateColumn()
    created_at: Date;
}