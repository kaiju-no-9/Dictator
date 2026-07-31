this part of the code base contain the shared schema that diffrent application in the codebase will use  
that incude : { this for testing propses as the schema may need to de upded in the future }
for now I have revied the schema with help of ai (chat-gpt) it said good to go with it but in future we have to keep an eye on it for any updates 


time line on which the current schema is build  upone ... ... 

PROJECT_STATUSES: created ➔ uploading ➔ processing ➔ planned ➔ editing ➔ rendering ➔ completed / failed

 
 ---- root ---- 
1. editPlanSchema: The root schema for a complete video edit plan
---------------- 
2. timelineEntrySchema: Defines an edited clip placement on the timeline

2. sourceShotSchema: Defines metadata for raw source video clips
3. videoSegmentSchema: Defines a segment of source video used in the edit
4. overlaySchema: Defines text or graphic overlays

Audio Sub-Schemas:
gainPointSchema: Keyframe point 
musicTrackSchema: Music track with optional gain curves, looping
sfxEventSchema: Sound effect trigger
voiceoverTrackSchema: Voiceover track
audioExportSettingsSchema: Output audio target
audioMixSchema: Aggregates music, SFX, 

exportSettingsSchema: Video rendering targets
Contains domain-specific semantic validation rules via 
validateEditPlan()
:

Rule Checks:
V-001: Ensures every timeline entry references
V-002 / V-003: Ensures trim_in and trim_out stay within the source 
V-004: Ensures trim_in < trim_out.
V-006 / V-007 / V-016: Validates limits on transition duration, playback speed, and overlay textlen
V-009 / V-010: Validates audio track time bounds and monotonic timestamp ordering of gain curves
V-012 / V-013 / V-015: Validates non-empty shot lists/timelines and checks overall timeline duration limits (1s to 4 hours)

ValidationSeverity: 'fatal' | 'error' | 'warning'
ValidationViolation: Details broken rules, target ,  messages
ValidationResult: Aggregates validation status and severity counters