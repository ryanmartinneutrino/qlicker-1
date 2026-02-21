export declare enum QuestionType {
    MC = 0,
    TF = 1,
    SA = 2,
    MS = 3,
    NU = 4
}
export declare enum UserRole {
    student = "student",
    prof = "professor",
    admin = "admin"
}
export declare enum SessionStatus {
    hidden = "hidden",
    visible = "visible",
    running = "running",
    done = "done"
}
export declare const QUESTION_TYPE_STRINGS: string[];
export declare const QUESTION_TYPE_STRINGS_SHORT: string[];
export declare const MC_ORDER: string[];
export declare const TF_ORDER: string[];
export declare const SA_ORDER: string[];
export declare const SESSION_STATUS_STRINGS: Record<string, string>;
/** Whether or not a question type can be automatically graded */
export declare function isAutoGradeable(type: QuestionType): boolean;
//# sourceMappingURL=configs.d.ts.map