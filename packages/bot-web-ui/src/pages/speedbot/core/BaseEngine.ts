/**
 * Base abstract class for all trading strategy engines.
 */
export abstract class BaseEngine {
    public abstract id: string;
    protected abstract name: string;

    /**
     * Life-cycle hook: Called when the engine starts.
     */
    protected abstract onStart(): void;

    /**
     * Life-cycle hook: Called when the engine stops.
     */
    protected abstract onStop(): void;

    /**
     * Update loop or heart-beat logic.
     */
    protected abstract update(): void;

    /**
     * Engine start trigger.
     */
    public abstract start(): void | Promise<void>;

    /**
     * Engine stop trigger.
     */
    public abstract stop(): void | Promise<void>;
}
