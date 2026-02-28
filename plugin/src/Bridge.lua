local HttpService = game:GetService("HttpService")

local Bridge = {}

local POLL_URL = "http://127.0.0.1:8765/poll"
local RESULTS_URL = "http://127.0.0.1:8765/results"

local function postResult(result)
	local ok, err = pcall(function()
		HttpService:PostAsync(RESULTS_URL, HttpService:JSONEncode(result), Enum.HttpContentType.ApplicationJson)
	end)
	if not ok then
		warn("[Lumit] Failed posting result:", err)
	end
end

function Bridge.start(onInstruction)
	task.spawn(function()
		local backoff = 0.1
		while true do
			local ok, body = pcall(function()
				return HttpService:GetAsync(POLL_URL, false)
			end)

			if ok then
				backoff = 0.1
				if body and body ~= "[]" then
					local decodeOk, instructions = pcall(function()
						return HttpService:JSONDecode(body)
					end)

					if decodeOk and type(instructions) == "table" then
						for _, inst in ipairs(instructions) do
							task.spawn(function()
								local success, result = pcall(onInstruction, inst)
								if not success then
									postResult({
										success = false,
										error = tostring(result),
										requestId = inst._requestId
									})
									return
								end

								result = result or {}
								result.requestId = inst._requestId
								postResult(result)
							end)
						end
					end
				end
			else
				warn("[Lumit] Bridge poll error:", body)
				task.wait(backoff)
				backoff = math.min(backoff * 2, 16)
			end

			task.wait(0.05)
		end
	end)
end

return Bridge
