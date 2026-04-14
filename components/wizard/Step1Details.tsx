"use client";

// The old Step1Details is replaced by Step1Setup in the new flow.
// Kept as a re-export shim to avoid breaking stale imports.
import Step1Setup from "./Step1Setup";
export default Step1Setup;
