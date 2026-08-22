-- CreateIndex
CREATE INDEX "tasks_organizationId_assigneeId_status_idx" ON "tasks"("organizationId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "users_organizationId_presenceState_idx" ON "users"("organizationId", "presenceState");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "announcements_organizationId_scope_targetRoom_idx" ON "announcements"("organizationId", "scope", "targetRoom");
