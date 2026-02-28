local Bridge = require(script.Parent.Bridge)
local Executor = require(script.Parent.Executor)

Bridge.start(Executor.run)
print("[Lumit] Studio plugin ready")
