local PathResolver = require(script.Parent.Parent.PathResolver)

local MATERIALS = {
	Grass = Enum.Material.Grass,
	SmoothPlastic = Enum.Material.SmoothPlastic,
	Neon = Enum.Material.Neon,
	Wood = Enum.Material.Wood,
	Metal = Enum.Material.Metal,
	Stone = Enum.Material.Stone,
	Glass = Enum.Material.Glass,
	Ice = Enum.Material.Ice,
	Slate = Enum.Material.Slate,
	Brick = Enum.Material.Brick,
	Sand = Enum.Material.Sand,
	Concrete = Enum.Material.Concrete,
	Fabric = Enum.Material.Fabric,
	ForceField = Enum.Material.ForceField,
	Cobblestone = Enum.Material.Cobblestone,
	DiamondPlate = Enum.Material.DiamondPlate,
	Foil = Enum.Material.Foil,
	Marble = Enum.Material.Marble,
	Pebble = Enum.Material.Pebble,
}

local function toVector3(v)
	if type(v) == "table" and #v >= 3 then
		return Vector3.new(v[1], v[2], v[3])
	end
	return nil
end

local function toColor3(v)
	if type(v) == "table" and #v >= 3 then
		return Color3.fromRGB(v[1], v[2], v[3])
	end
	return nil
end

return function(inst)
	local parent = workspace
	if inst.parent and inst.parent ~= "Workspace" then
		local resolved, err = PathResolver.resolve(inst.parent)
		if not resolved then
			return { success = false, error = err }
		end
		parent = resolved
	end

	local part = Instance.new("Part")
	part.Name = inst.name or "Part"
	part.Parent = parent

	local props = inst.properties or {}
	if props.Size then part.Size = toVector3(props.Size) or part.Size end
	if props.Position then part.Position = toVector3(props.Position) or part.Position end
	if props.Color then part.Color = toColor3(props.Color) or part.Color end
	if props.BrickColor then part.BrickColor = BrickColor.new(props.BrickColor) end
	if props.Material and MATERIALS[props.Material] then part.Material = MATERIALS[props.Material] end
	if props.Anchored ~= nil then part.Anchored = props.Anchored end
	if props.CanCollide ~= nil then part.CanCollide = props.CanCollide end
	if props.Transparency ~= nil then part.Transparency = props.Transparency end
	if props.CastShadow ~= nil then part.CastShadow = props.CastShadow end

	if props.Shape == "Ball" then
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Parent = part
	elseif props.Shape == "Cylinder" then
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Cylinder
		mesh.Parent = part
	end

	return { success = true, path = PathResolver.pathOf(part) }
end
