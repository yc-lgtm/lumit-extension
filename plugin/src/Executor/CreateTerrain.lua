local PathResolver = require(script.Parent.Parent.PathResolver)

return function(inst)
	local terrain = workspace:FindFirstChildOfClass("Terrain")
	if not terrain then
		return { success = false, error = "Terrain service unavailable" }
	end

	local size = inst.size or { 256, 32, 256 }
	local pos = inst.position or { 0, 0, 0 }
	local regionSize = Vector3.new(size[1], size[2], size[3])
	local regionPos = Vector3.new(pos[1], pos[2], pos[3])
	terrain:FillBlock(CFrame.new(regionPos), regionSize, Enum.Material.Grass)

	return { success = true, path = PathResolver.pathOf(terrain) }
end
